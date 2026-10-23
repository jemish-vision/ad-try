import * as Yup from "yup";
const email =
  /^[a-z0-9]([a-z0-9_\-.]*)@([a-z0-9_\-.]*)(\.[a-z]{2,4}(\.[a-z]{2}){0,2})$/i;

export const loginSchema = Yup.object().shape({
  email: Yup.string()
    .required("Email is required")
    .matches(email, "Please check your email ")
    .nullable(),

  password: Yup.string().required("Password is required").nullable(),
});

export const registerSchema = Yup.object({
  companyName: Yup.string().required("Organization name is required"),
  fullName: Yup.string().required("Full name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Email is required"),
  phoneNumber: Yup.string()
    .matches(/^[0-9]{10}$/, "Mobile number must be 10 digits")
    .required("Mobile number is required"),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords do not match")
    .required("Confirm password is required"),
});

export const registerSchemaInvited = Yup.object({
  fullName: Yup.string().required("Full name is required"),
  email: Yup.string()
    .email("Invalid email address")
    .required("Email is required"),
  phoneNumber: Yup.string()
    .matches(/^[0-9]{10}$/, "Mobile number must be 10 digits")
    .required("Mobile number is required"),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords do not match")
    .required("Confirm password is required"),
});


export const changePWDSchema = Yup.object().shape({
  password: Yup.string()
    .required('New Password is required')
    .matches(/(?=^.{8,}$).*$/, "Password must contain at least 8 characters")
    .matches(/(?=.*\d).*$/, "Password must contain at least 1 digit")
    .matches(/(?=.*[!@#$%^&*]+).*$/, "Password must contain at least 1 special character")
    .matches(/(?![.\n]).*$/, "Password format not proper")
    .matches(/(?=.*[A-Z]).*$/, "Password must contain at least 1 uppercase letter")
    .matches(/(?=.*[a-z]).*$/, "Password must contain at least 1 lowercase letter"),

  confirmPwd: Yup.string()
    .required('Confirm Password is required')
    .oneOf([Yup.ref('password')], 'New password and confirm password should be same'),

  oldpwd: Yup.string()
    .required('Old Password is required')

})
