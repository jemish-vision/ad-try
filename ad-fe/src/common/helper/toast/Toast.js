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

  success(message) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    toast.success(this.translate(message), TOAST_OPTS);
  }

  warning(message) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    toast.warning(this.translate(message), TOAST_OPTS);
  }

  error(message) {
    if (!message || (typeof message === "string" && !message.trim())) return;
    toast.error(this.translate(message), TOAST_OPTS);
  }
}
const toastInstance = new Toast();
export default toastInstance;

