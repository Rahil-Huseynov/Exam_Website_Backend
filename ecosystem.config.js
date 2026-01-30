module.exports = {
  apps: [
    {
      name: "exam-backend",
      script: "dist/src/main.js",
      instances: 1,
      autorestart: true,
      watch: false,
      cwd: "/mnt/Disk_1TB/Exam_Website/Exam_Website_Backend",
      env: {
        NODE_ENV: "production",
        PYTHON_CMD: "/mnt/Disk_1TB/Exam_Website/Exam_Website_Backend/.venv/bin/python"
      }
    }
  ]
};
