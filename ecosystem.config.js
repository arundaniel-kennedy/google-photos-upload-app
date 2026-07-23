// PM2 process configuration for a Linux VPS behind an Nginx reverse proxy.
module.exports = {
  apps: [
    {
      name: 'google-photos-portal',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
