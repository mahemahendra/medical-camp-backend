// PM2 Ecosystem Configuration
// Manages the Node.js backend process with auto-restart, logging, etc.
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup  (to auto-start on boot)
//
// Monitoring:
//   pm2 status
//   pm2 logs medical-camp-backend
//   pm2 monit

module.exports = {
  apps: [
    {
      name: 'medical-camp-backend',
      script: 'dist/index.js',
      cwd: '/home/app/medical-camp-backend',
      instances: 1,             // e2-micro has limited resources — 1 instance
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Memory management for e2-micro (614MB RAM shared with PostgreSQL + Nginx)
      max_memory_restart: '256M',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/home/app/logs/backend-error.log',
      out_file: '/home/app/logs/backend-out.log',
      merge_logs: true,
      log_type: 'json',
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,       // 5 seconds between restarts
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    }
  ]
};
