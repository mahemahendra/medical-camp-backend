import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { FollowUp, FollowUpStatus } from '../models/FollowUp';
import { Consultation } from '../models/Consultation';
import { Like, In } from 'typeorm';

/**
 * Follow-Up (Sales) controller - handles post-consultation follow-up tracking
 */

/**
 * GET /api/sales/:campId/visitors
 * List visitors with completed consultations, with their follow-up status
 * Supports search by name, phone, patientId and pagination
 */
export const listVisitors = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const campId = req.user!.campId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = (req.query.search as string || '').trim();
  const statusFilter = req.query.status as string || '';
  const offset = (page - 1) * limit;

  try {
    const visitRepo = AppDataSource.getRepository(Visit);
    const followUpRepo = AppDataSource.getRepository(FollowUp);

    // Find all visitors with completed visits in this camp
    const visitQuery = visitRepo.createQueryBuilder('visit')
      .innerJoinAndSelect('visit.visitor', 'visitor')
      .leftJoinAndSelect('visit.consultation', 'consultation')
      .leftJoinAndSelect('visit.doctor', 'doctor')
      .where('visit.campId = :campId', { campId })
      .andWhere('visit.status = :status', { status: VisitStatus.COMPLETED });

    if (search) {
      visitQuery.andWhere(
        '(visitor.name ILIKE :search OR visitor.phone ILIKE :search OR visitor.patientIdPerCamp ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    visitQuery.orderBy('visit.updatedAt', 'DESC');

    const [completedVisits, totalVisits] = await visitQuery
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Get visitor IDs from these visits
    const visitorIds = [...new Set(completedVisits.map(v => v.visitorId))];

    // Get follow-up records for these visitors
    let followUps: FollowUp[] = [];
    if (visitorIds.length > 0) {
      followUps = await followUpRepo.find({
        where: {
          campId,
          visitorId: In(visitorIds)
        },
        relations: ['salesUser']
      });
    }

    // Create a map of visitorId -> followUp
    const followUpMap = new Map<string, FollowUp>();
    followUps.forEach(fu => followUpMap.set(fu.visitorId, fu));

    // Build response with visitor + follow-up data
    let results = completedVisits.map(visit => ({
      visitor: {
        id: visit.visitor.id,
        name: visit.visitor.name,
        phone: visit.visitor.phone,
        age: visit.visitor.age,
        gender: visit.visitor.gender,
        patientIdPerCamp: visit.visitor.patientIdPerCamp,
        address: visit.visitor.address,
        city: visit.visitor.city,
        symptoms: visit.visitor.symptoms,
        existingConditions: visit.visitor.existingConditions
      },
      visit: {
        id: visit.id,
        status: visit.status,
        consultationTime: visit.consultationTime,
        doctorName: visit.doctor?.name || 'Unknown'
      },
      consultation: visit.consultation ? {
        diagnosis: visit.consultation.diagnosis,
        treatmentPlan: visit.consultation.treatmentPlan,
        followUpAdvice: visit.consultation.followUpAdvice
      } : null,
      followUp: followUpMap.has(visit.visitorId) ? {
        id: followUpMap.get(visit.visitorId)!.id,
        status: followUpMap.get(visit.visitorId)!.status,
        comment: followUpMap.get(visit.visitorId)!.comment,
        calledAt: followUpMap.get(visit.visitorId)!.calledAt,
        salesUserName: followUpMap.get(visit.visitorId)!.salesUser?.name || 'Unknown',
        updatedAt: followUpMap.get(visit.visitorId)!.updatedAt
      } : null
    }));

    // Filter by follow-up status if requested
    if (statusFilter) {
      if (statusFilter === 'PENDING') {
        results = results.filter(r => !r.followUp);
      } else {
        results = results.filter(r => r.followUp?.status === statusFilter);
      }
    }

    res.json({
      data: results,
      pagination: {
        page,
        limit,
        total: totalVisits,
        totalPages: Math.ceil(totalVisits / limit)
      }
    });
  } catch (error) {
    console.error('Error listing follow-up visitors:', error);
    res.status(500).json({ error: 'Failed to load visitors' });
  }
};

/**
 * GET /api/sales/:campId/follow-up/:visitorId
 * Get follow-up detail for a specific visitor
 */
export const getFollowUp = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const campId = req.user!.campId!;
  const { visitorId } = req.params;

  try {
    const followUpRepo = AppDataSource.getRepository(FollowUp);

    const followUp = await followUpRepo.findOne({
      where: { campId, visitorId },
      relations: ['salesUser', 'visitor']
    });

    if (!followUp) {
      return res.json({ followUp: null });
    }

    res.json({
      followUp: {
        id: followUp.id,
        status: followUp.status,
        comment: followUp.comment,
        calledAt: followUp.calledAt,
        salesUserName: followUp.salesUser?.name || 'Unknown',
        visitorName: followUp.visitor?.name || 'Unknown',
        createdAt: followUp.createdAt,
        updatedAt: followUp.updatedAt
      }
    });
  } catch (error) {
    console.error('Error getting follow-up:', error);
    res.status(500).json({ error: 'Failed to get follow-up details' });
  }
};

/**
 * PUT /api/sales/:campId/follow-up/:visitorId
 * Create or update follow-up entry for a visitor (upsert)
 */
export const upsertFollowUp = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const campId = req.user!.campId!;
  const salesUserId = req.user!.id;
  const { visitorId } = req.params;
  const { status, comment } = req.body;

  try {
    // Verify visitor exists and belongs to this camp
    const visitorRepo = AppDataSource.getRepository(Visitor);
    const visitor = await visitorRepo.findOne({
      where: { id: visitorId, campId }
    });

    if (!visitor) {
      return res.status(404).json({ error: 'Visitor not found in this camp' });
    }

    // Verify visitor has a completed visit
    const visitRepo = AppDataSource.getRepository(Visit);
    const completedVisit = await visitRepo.findOne({
      where: { visitorId, campId, status: VisitStatus.COMPLETED }
    });

    if (!completedVisit) {
      return res.status(400).json({ error: 'Visitor does not have a completed consultation' });
    }

    const followUpRepo = AppDataSource.getRepository(FollowUp);

    // Try to find existing follow-up
    let followUp = await followUpRepo.findOne({
      where: { campId, visitorId }
    });

    if (followUp) {
      // Update existing
      followUp.status = status;
      followUp.comment = comment || null;
      followUp.calledAt = new Date();
      followUp.salesUserId = salesUserId;
    } else {
      // Create new
      followUp = followUpRepo.create({
        campId,
        visitorId,
        salesUserId,
        status,
        comment: comment || null,
        calledAt: new Date()
      });
    }

    await followUpRepo.save(followUp);

    res.json({
      message: 'Follow-up saved successfully',
      followUp: {
        id: followUp.id,
        status: followUp.status,
        comment: followUp.comment,
        calledAt: followUp.calledAt,
        updatedAt: followUp.updatedAt
      }
    });
  } catch (error) {
    console.error('Error saving follow-up:', error);
    res.status(500).json({ error: 'Failed to save follow-up' });
  }
};

/**
 * GET /api/sales/:campId/stats
 * Get follow-up statistics for the camp
 */
export const getStats = async (req: AuthRequest, res: Response) => {
  const campId = req.user!.campId!;

  try {
    const followUpRepo = AppDataSource.getRepository(FollowUp);
    const visitRepo = AppDataSource.getRepository(Visit);

    // Total completed visits (potential follow-ups)
    const totalCompleted = await visitRepo.count({
      where: { campId, status: VisitStatus.COMPLETED }
    });

    // Follow-up counts by status
    const statusCounts = await followUpRepo.createQueryBuilder('followUp')
      .select('followUp.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('followUp.campId = :campId', { campId })
      .groupBy('followUp.status')
      .getRawMany();

    const totalFollowedUp = statusCounts.reduce((sum: number, s: any) => sum + parseInt(s.count), 0);

    res.json({
      totalCompleted,
      totalFollowedUp,
      totalPending: totalCompleted - totalFollowedUp,
      statusBreakdown: statusCounts.map((s: any) => ({
        status: s.status,
        count: parseInt(s.count)
      }))
    });
  } catch (error) {
    console.error('Error getting follow-up stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};
