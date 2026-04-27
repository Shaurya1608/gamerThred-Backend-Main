export const generateReferralCode = () => {
  return "GMT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
};
