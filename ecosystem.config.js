module.exports = {
  apps: [
    {
      name: "exam-backend",
      script: "./start.sh",
      interpreter: "/bin/bash",
      cwd: "/mnt/Disk_1TB/Exam_Website/Exam_Website_Backend",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}

