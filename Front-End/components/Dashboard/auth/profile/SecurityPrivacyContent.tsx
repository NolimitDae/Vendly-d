"use client";
import { ChangePassIcon, FingerIcon, MacIcon, TrashTwo } from "@/icons";
import ToggleSwitch from "./ToggleSwitch";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { TwoFAService } from "@/service/twofa/twofa.service";
import IpadIcon from "@/icons/IpadIcon";
import { Delete, Trash, Trash2 } from "lucide-react";
import TrashIcon from "@/icons/TrashIcon";

const devicesData = [
  {
    id: 1,
    name: "MacBook Pro (You)",
    version: "macOS 14",
    location: "Los Angeles, USA",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: true,
    icon: <MacIcon />,
  },
  {
    id: 2,
    name: "Windows PC (Edge)",
    version: "Windows 11",
    location: "New York, USA",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: false,
    icon: <MacIcon />,
  },
  {
    id: 3,
    name: "iPad Air (Firefox)",
    version: "iPadOS 17",
    location: "Houston, Texas",
    lastActive: "Feb 15, 2025, 10:32 AM",
    isCurrent: false,
    icon: <IpadIcon />,
  },
];

// The device list below is placeholder data: no backend tracks admin sessions or devices yet, so it
// is not rendered. Turn this on once a real sessions endpoint exists.
const SHOW_DEVICES = false;

type Step = "idle" | "setup" | "disable";

const SecurityPrivacyContent = () => {
  // real 2FA state from GET /auth/2fa-status (null while loading)
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    TwoFAService.getStatus()
      .then((res) => {
        if (res.data?.success) setEnabled(!!res.data.data?.enabled);
        else setEnabled(false);
      })
      .catch(() => setEnabled(false));
  }, []);

  const reset = () => {
    setStep("idle");
    setQrCode("");
    setSecret("");
    setCode("");
  };

  // same flow as the website's Account Settings: secret + QR, verify a code, then enable
  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await TwoFAService.generateSecret();
      if (res.data?.success) {
        setQrCode(res.data.data.qrCode);
        setSecret(res.data.data.secret);
        setCode("");
        setStep("setup");
      } else {
        toast.error(res.data?.message || "Failed to generate QR code");
      }
    } catch {
      toast.error("Failed to generate QR code");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    if (code.length !== 6) { toast.error("Enter a 6-digit code"); return; }
    setBusy(true);
    try {
      const res = await TwoFAService.verifyToken(code);
      if (!res.data?.success) {
        toast.error(res.data?.message || "Invalid code — try again");
        return;
      }
      const enableRes = await TwoFAService.enable();
      if (enableRes.data?.success) {
        setEnabled(true);
        reset();
        toast.success("Two-factor authentication enabled");
      } else {
        toast.error(enableRes.data?.message || "Failed to enable 2FA");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    if (code.length !== 6) { toast.error("Enter a 6-digit code"); return; }
    setBusy(true);
    try {
      // the server checks the code before turning 2FA off
      const res = await TwoFAService.disable(code);
      if (res.data?.success) {
        setEnabled(false);
        reset();
        toast.success("Two-factor authentication disabled");
      } else {
        toast.error(res.data?.message || "Invalid code — try again");
      }
    } catch {
      toast.error("Failed to disable 2FA");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = (next: boolean) => {
    if (busy || enabled === null) return;
    if (next && !enabled) startSetup();
    else if (!next && enabled) {
      setCode("");
      setStep("disable");
    }
  };

  return (
    <div>
      <h2 className="text-blackColor text-lg md:text-[1.25rem] font-semibold leading-7 tracking-[-0.013rem]">
        Security & Privacy
      </h2>

      <div className="p-3 rounded-lg bg-grayBg mt-3 space-y-3">
        <ChangePassIcon />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-blackColor text-base font-medium leading-[160%]">
              Change Password
            </h2>
            <span className="bg-clip-text text-sm capitalize font-medium leading-[160%] text-transparent bg-gradient-to-r from-purpleOne via-purpleTwo to-purpleThree">
              change
            </span>
          </div>
          <p className="text-descriptionColor text-sm font-normal leading-[160%]">
            Update your account password for enhanced security.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-grayBg mt-3 space-y-3">
        <FingerIcon />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-blackColor text-base font-medium leading-[160%]">
              Two-factor authentication (2FA)
            </h2>
            <ToggleSwitch
              checked={!!enabled}
              onChange={onToggle}
              disabled={enabled === null || busy || step !== "idle"}
            />
          </div>
          <p className="text-descriptionColor text-sm font-normal leading-[160%]">
            {enabled === null
              ? "Checking 2FA status…"
              : enabled
                ? "On: you'll be asked for a code from your authenticator app when you log in."
                : "Enable an extra layer of security for account login."}
          </p>
        </div>

        {step === "setup" && (
          <div className="space-y-3">
            <p className="text-descriptionColor text-sm leading-[160%]">
              Scan this QR code with your authenticator app (or enter the key), then type the 6-digit code it shows.
            </p>
            {qrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCode} alt="2FA QR code" width={160} height={160} className="rounded-lg bg-white p-2" />
            )}
            {secret && (
              <p className="text-xs text-descriptionColor break-all">
                Key: <span className="font-mono text-blackColor">{secret}</span>
              </p>
            )}
            <input
              aria-label="Authenticator code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-3 py-2 rounded-lg border border-borderColor bg-white text-sm text-blackColor dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button type="button" onClick={reset} disabled={busy} className="flex-1 py-2 rounded-lg border border-borderColor text-sm text-blackColor disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={confirmSetup} disabled={busy || code.length !== 6} className="flex-1 py-2 rounded-lg bg-purpleOne text-white text-sm font-medium disabled:opacity-50">
                {busy ? "Verifying…" : "Verify & Enable"}
              </button>
            </div>
          </div>
        )}

        {step === "disable" && (
          <div className="space-y-3">
            <p className="text-descriptionColor text-sm leading-[160%]">
              Enter the 6-digit code from your authenticator app to turn 2FA off.
            </p>
            <input
              aria-label="Authenticator code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-3 py-2 rounded-lg border border-borderColor bg-white text-sm text-blackColor dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button type="button" onClick={reset} disabled={busy} className="flex-1 py-2 rounded-lg border border-borderColor text-sm text-blackColor disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={confirmDisable} disabled={busy || code.length !== 6} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50">
                {busy ? "Disabling…" : "Disable 2FA"}
              </button>
            </div>
          </div>
        )}
      </div>

      {SHOW_DEVICES && (
      <div className="p-3 rounded-lg bg-grayBg my-3 space-y-3">
        <h2 className="text-blackColor text-base font-medium leading-[160%]">
          Device Management
        </h2>

        <div className="space-y-3">
          {devicesData.map((device) => (
            <div key={device.id} className="flex items-center gap-3">
              <div className="w-[2.5rem] h-[2.5rem] flex items-center justify-center bg-white rounded-lg border-[0.5px] border-borderColor dark:bg-gray-800">
                {device.icon}
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-blackColor text-sm font-medium leading-[160%]">
                  {device.name}
                </h3>

                <div className="flex flex-col sm:flex-row justify-start md:items-center gap-1 md:gap-4">
                  {" "}
                  <p className="text-descriptionColor text-xs font-normal leading-[160%]">
                    {device.location}
                  </p>
                  <p className="text-descriptionColor text-xs font-normal leading-[160%]">
                    Last Active: {device.lastActive}
                  </p>{" "}
                </div>
              </div>
              <TrashTwo />
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};
export default SecurityPrivacyContent;
