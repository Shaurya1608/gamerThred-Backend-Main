import * as yup from "yup";

export const openBoxSchema = yup.object({
  body: yup.object({
    boxCode: yup.string().required("Box code is required").uppercase().trim()
  })
});

export const useItemSchema = yup.object({
  body: yup.object({
    itemCode: yup.string().required("Item code is required").uppercase().trim(),
    quantity: yup.number().integer().min(1).default(1)
  })
});

export const validate = (schema) => async (req, res, next) => {
  try {
    await schema.validate({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return next();
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};
