module.exports = {
  apps: [
    {
      name: 'nest-server',
      script: 'npm',
      args: 'run start:prod',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
