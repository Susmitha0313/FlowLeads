export default ({ config }) => ({
  ...config,
  name: "Bobi",
  slug: "bobi",
  extra: {
    ...config.extra,
    apiUrl: process.env.API_URL || "http://localhost:5000",
  },
});