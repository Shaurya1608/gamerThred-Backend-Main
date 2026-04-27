export const TIERS = {
    BRONZE: { name: "Bronze", min: 0, color: "#CD7F32" },
    SILVER: { name: "Silver", min: 1200, color: "#C0C0C0" },
    GOLD: { name: "Gold", min: 1500, color: "#FFD700" },
    PLATINUM: { name: "Platinum", min: 1800, color: "#E5E4E2" },
    DIAMOND: { name: "Diamond", min: 2100, color: "#B9F2FF" },
    ELITE: { name: "Elite", min: 2500, color: "#FF3E3E" }
};

export const calculateTier = (elo) => {
    if (elo >= TIERS.ELITE.min) return "ELITE";
    if (elo >= TIERS.DIAMOND.min) return "DIAMOND";
    if (elo >= TIERS.PLATINUM.min) return "PLATINUM";
    if (elo >= TIERS.GOLD.min) return "GOLD";
    if (elo >= TIERS.SILVER.min) return "SILVER";
    return "BRONZE";
};

export const getTierInfo = (tierKey) => {
    return TIERS[tierKey] || TIERS.BRONZE;
};

export const calculateEloChange = (playerElo, opponentElo, isWinner) => {
    const K = 32; // K-factor
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    
    // actualScore: 1 for win, 0 for loss, 0.5 for draw
    let actualScore = 0.5;
    if (isWinner === true) actualScore = 1;
    else if (isWinner === false) actualScore = 0;
    
    const change = Math.round(K * (actualScore - expectedScore));
    
    // Ensure minimum change for clear wins/losses (not necessarily for draws)
    if (isWinner === true && change < 5) return 15; 
    if (isWinner === false && change > -5) return -15; 
    
    return change;
};
