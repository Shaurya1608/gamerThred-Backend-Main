import express from "express";
import { 
    getTicketStatus, 
    claimDailyTickets, 
    convertGtcToTickets, 
    adReward 
} from "../controllers/ticketController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

router.get("/status", isAuthenticated, getTicketStatus);
router.post("/daily-claim", isAuthenticated, claimDailyTickets);
router.post("/convert", isAuthenticated, convertGtcToTickets);
router.post("/ad-reward", isAuthenticated, adReward);

export default router;
