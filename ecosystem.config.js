module.exports = {
  apps: [
    {
      name: "ci-cd_pipeline_manager",
      cwd: __dirname,
      script: "npm",
      args: "run start",
      interpreter: "bash",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
