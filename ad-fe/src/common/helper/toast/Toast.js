import { toast } from "react-toastify";
import i18n from "../../../i18n";

const TOAST_OPTS = {
  position: "top-right",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: false,
  pauseOnFocusLoss: false,
  draggable: true
};

class Toast {
  translate(message) {
    if (!message) return "";
    if (typeof message === "string") {
      return i18n.t(message);
    }
    return message;
  }

  success(message, options = {}) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    const opts = { ...TOAST_OPTS, ...options };
    if (opts.toastId && toast.isActive(opts.toastId)) {
      return;
    }
    toast.success(this.translate(message), opts);
  }

  warning(message, options = {}) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    const opts = { ...TOAST_OPTS, ...options };
    if (opts.toastId && toast.isActive(opts.toastId)) {
      return;
    }
    toast.warning(this.translate(message), opts);
  }

  error(message, options = {}) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    const opts = { ...TOAST_OPTS, ...options };
    if (opts.toastId && toast.isActive(opts.toastId)) {
      return;
    }
    toast.error(this.translate(message), opts);
  }
}
const toastInstance = new Toast();
export default toastInstance;

