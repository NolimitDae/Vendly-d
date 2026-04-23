import { AppConfig } from "@/config/app.config";
import { io } from "socket.io-client";

// initialize socket
export const socket = io(AppConfig().app.url);
