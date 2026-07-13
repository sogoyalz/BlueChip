import { Router } from "express";
import { Signup, Login, Logout } from "../controllers/AuthController";
import { userVerification } from "../middlewares/AuthMiddleware";

const router = Router();

router.post("/signup", Signup);
router.post("/login", Login);
router.post("/logout", Logout); // clears the auth cookie
router.post("/", userVerification); // frontend calls this to check "am I still logged in?"

export default router;
