import express from "express";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { 
    searchUsers, 
    sendFriendRequest, 
    acceptFriendRequest, 
    declineFriendRequest, 
    getFriends,
    unfriend 
} from "../controllers/friendController.js";

const router = express.Router();

router.use(isAuthenticated);

router.get("/", getFriends);
router.get("/search", searchUsers);
router.post("/request", sendFriendRequest);
router.post("/accept", acceptFriendRequest);
router.post("/decline", declineFriendRequest);
router.post("/unfriend", unfriend);

export default router;
