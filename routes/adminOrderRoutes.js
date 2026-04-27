import express from "express";
import { getAllOrders, updateOrderStatus, handleCancellationRequest, deleteOrder } from "../controllers/adminOrderController.js";
import { isAdmin, checkPermission } from "../middleware/isAdmin.js";

const router = express.Router();

router.use(isAdmin);
router.use(checkPermission("manage_orders"));

router.get("/", getAllOrders);
router.patch("/:orderId/status", updateOrderStatus);
router.post("/:orderId/cancel-request", handleCancellationRequest);
router.delete("/:orderId", deleteOrder);

export default router;
