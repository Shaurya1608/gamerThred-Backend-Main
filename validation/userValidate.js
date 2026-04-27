import yup from "yup";

export const userSchema = yup.object({
  username: yup
    .string()
    .trim()
    .required("Username is required")
    .min(3, "Username must be at least 3 characters long"),
  email: yup
    .string()
    .email("Invalid email format")
    .required("Email is required"),
  password: yup
    .string()
    .required("Password is required")
    .min(7, "Password must be at least 7 characters long"),
});

export const validateUser = (schema) => async (req, res, next) => {
    try {
        await schema.validate(req.body);
        next();
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
}