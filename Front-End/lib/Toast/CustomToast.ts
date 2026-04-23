import { toast } from "react-toastify";

export class CustomToast {
  static show(text: string) {
    return toast(text, {
      position: "bottom-right",
    });
  }
}
