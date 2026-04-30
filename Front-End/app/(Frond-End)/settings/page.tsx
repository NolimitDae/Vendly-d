"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldCheck, QrCode, KeyRound, ChevronRight, Loader2, X } from "lucide-react";
import Image from "next/image";
import Container from "@/app/_components/Container";
import { TwoFAService } from "@/service/twofa/twofa.service";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

type SetupStep = "idle" | "qr" | "verify";

export default function SettingsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Enable flow
  const [setupStep, setSetupStep] = useState<SetupStep>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);

  // Disable flow
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  useEffect(() => {
    TwoFAService.getStatus()
      .then((res) => {
        if (res.data?.success) setEnabled(res.data.data.enabled);
      })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  const startEnable = async () => {
    setGeneratingQr(true);
    try {
      const res = await TwoFAService.generateSecret();
      if (res.data?.success) {
        setQrCode(res.data.data.qrCode);
        setSecret(res.data.data.secret);
        setSetupStep("qr");
      } else {
        toast.error(res.data?.message || "Failed to generate QR code");
      }
    } catch {
      toast.error("Failed to generate QR code");
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) { toast.error("Enter a 6-digit code"); return; }
    setVerifying(true);
    try {
      const res = await TwoFAService.verifyToken(verifyCode);
      if (res.data?.success) {
        setEnabling(true);
        const enableRes = await TwoFAService.enable();
        if (enableRes.data?.success) {
          setEnabled(true);
          setSetupStep("idle");
          setVerifyCode("");
          setQrCode("");
          setSecret("");
          toast.success("Two-factor authentication enabled");
        } else {
          toast.error(enableRes.data?.message || "Failed to enable 2FA");
        }
      } else {
        toast.error(res.data?.message || "Invalid code — try again");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
      setEnabling(false);
    }
  };

  const cancelSetup = () => {
    setSetupStep("idle");
    setVerifyCode("");
    setQrCode("");
    setSecret("");
  };

  const handleDisable = async () => {
    if (disableCode.length !== 6) { toast.error("Enter a 6-digit code"); return; }
    setDisabling(true);
    try {
      const res = await TwoFAService.disable(disableCode);
      if (res.data?.success) {
        setEnabled(false);
        setShowDisableModal(false);
        setDisableCode("");
        toast.success("Two-factor authentication disabled");
      } else {
        toast.error(res.data?.message || "Invalid code — try again");
      }
    } catch {
      toast.error("Failed to disable 2FA");
    } finally {
      setDisabling(false);
    }
  };

  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Account Settings
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            Manage your security preferences
          </p>

          {/* 2FA card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  enabled ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-700",
                )}>
                  {enabled
                    ? <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                    : <Shield className="w-5 h-5 text-gray-500" />
                  }
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Two-Factor Authentication
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add an extra layer of security to your account
                  </p>
                </div>
              </div>

              {loadingStatus ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <span className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-full",
                  enabled
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                )}>
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              )}
            </div>

            {/* Body */}
            <div className="p-6">
              {/* ── IDLE / intro ── */}
              {setupStep === "idle" && (
                <>
                  {enabled === false && (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Use an authenticator app (Google Authenticator, Authy, etc.) to generate
                        time-based one-time passwords when you log in.
                      </p>
                      <button
                        onClick={startEnable}
                        disabled={generatingQr || loadingStatus}
                        className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
                      >
                        {generatingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                        {generatingQr ? "Generating…" : "Enable 2FA"}
                        {!generatingQr && <ChevronRight className="w-4 h-4 ml-auto" />}
                      </button>
                    </div>
                  )}

                  {enabled === true && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <ShieldCheck className="w-4 h-4" />
                        Your account is protected with two-factor authentication.
                      </div>
                      <button
                        onClick={() => setShowDisableModal(true)}
                        className="flex items-center gap-2 border border-red-200 text-red-600 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        <Shield className="w-4 h-4" />
                        Disable 2FA
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── STEP 1: QR code ── */}
              {setupStep === "qr" && (
                <div className="space-y-5">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Scan the QR code below with your authenticator app, then click{" "}
                    <strong>Next</strong> to enter the 6-digit code it generates.
                  </p>

                  {qrCode && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-200 inline-block">
                        <Image src={qrCode} alt="2FA QR code" width={180} height={180} unoptimized />
                      </div>
                      <details className="text-center">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 transition">
                          Can&apos;t scan? Enter code manually
                        </summary>
                        <p className="mt-2 font-mono text-sm break-all bg-gray-50 dark:bg-gray-700 px-4 py-2 rounded-xl text-gray-700 dark:text-gray-300">
                          {secret}
                        </p>
                      </details>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={cancelSetup}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setSetupStep("verify")}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition"
                    >
                      Next — Enter Code
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Verify code ── */}
              {setupStep === "verify" && (
                <div className="space-y-5">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Open your authenticator app and enter the 6-digit code for Vendly.
                  </p>

                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">
                      6-digit verification code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setSetupStep("qr")}
                      disabled={verifying}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleVerify}
                      disabled={verifying || enabling || verifyCode.length !== 6}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {(verifying || enabling) && <Loader2 className="w-4 h-4 animate-spin" />}
                      {verifying ? "Verifying…" : enabling ? "Enabling…" : "Verify & Enable"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* Disable 2FA modal */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-red-500" />
                Disable Two-Factor Auth
              </h3>
              <button
                onClick={() => { setShowDisableModal(false); setDisableCode(""); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Enter the 6-digit code from your authenticator app to confirm.
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDisableModal(false); setDisableCode(""); }}
                disabled={disabling}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDisable}
                disabled={disabling || disableCode.length !== 6}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {disabling && <Loader2 className="w-4 h-4 animate-spin" />}
                {disabling ? "Disabling…" : "Disable 2FA"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
