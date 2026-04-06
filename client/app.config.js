export default ({ config }) => ({
  ...config,
  name: "Bobi",
  slug: "bobi",
  scheme: "bobi",
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL  || "https://flowleads.onrender.com/api",
  },
  android: {
    ...config.android,
    package: "com.bobz.flowlead",
    intentFilters: [
      {
        action: "android.intent.action.SEND",
        category: ["android.intent.category.DEFAULT"],
        data: [{ mimeType: "text/plain" }],
      },
      {
        action: "android.intent.action.VIEW",
        category: [
          "android.intent.category.DEFAULT",
          "android.intent.category.BROWSABLE",
        ],
        data: [
          { scheme: "https", host: "www.linkedin.com", pathPrefix: "/in/" },
          { scheme: "https", host: "linkedin.com", pathPrefix: "/in/" },
        ],
      },
    ],
  },
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ["bobi"],
        },
      ],
    },
  },
});
