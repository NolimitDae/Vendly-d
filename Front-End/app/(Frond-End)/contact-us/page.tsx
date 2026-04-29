"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2, Mail, MessageSquare, User } from "lucide-react";
import Container from "@/app/_components/Container";
import { Fetch } from "@/lib/Fetch";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function ContactUsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setServerError("");
    try {
      const [firstName, ...rest] = data.name.trim().split(" ");
      const res = await Fetch.post("/contact", {
        first_name: firstName,
        last_name: rest.join(" ") || undefined,
        email: data.email,
        message: `Subject: ${data.subject}\n\n${data.message}`,
      });
      if (res.data?.success) {
        setSubmitted(true);
      } else {
        setServerError(res.data?.message || "Something went wrong. Please try again.");
      }
    } catch {
      setServerError("Unable to send your message. Please try again later.");
    }
  };

  return (
    <section className="py-16 sm:py-24 min-h-screen">
      <Container>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-blackColor dark:text-white mb-4 leading-tight">
              Get in Touch
            </h1>
            <p className="text-descriptionColor dark:text-gray-400 text-base sm:text-lg leading-relaxed">
              Have a question or need help? We&apos;d love to hear from you.
              Send us a message and we&apos;ll get back to you as soon as
              possible.
            </p>
          </div>

          {submitted ? (
            <div className="bg-greenBg border border-greenBorder rounded-2xl p-10 flex flex-col items-center text-center gap-4">
              <CheckCircle2 className="w-14 h-14 text-greenText" />
              <h2 className="text-xl font-semibold text-blackColor dark:text-white">
                Message sent!
              </h2>
              <p className="text-descriptionColor dark:text-gray-400 text-sm max-w-sm">
                Thanks for reaching out. Our team will review your message and
                get back to you within 1–2 business days.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="bg-grayBg dark:bg-gray-900 rounded-2xl p-6 sm:p-10 space-y-6"
            >
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-blackColor dark:text-white mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-descriptionColor pointer-events-none" />
                  <input
                    {...register("name")}
                    placeholder="Sarah Johnson"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-borderColor dark:border-gray-700 text-blackColor dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primaryColor/30 focus:border-primaryColor transition text-sm"
                  />
                </div>
                {errors.name && (
                  <p className="mt-1.5 text-xs text-redColor">{errors.name.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-blackColor dark:text-white mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-descriptionColor pointer-events-none" />
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="sarah@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-borderColor dark:border-gray-700 text-blackColor dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primaryColor/30 focus:border-primaryColor transition text-sm"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-redColor">{errors.email.message}</p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-blackColor dark:text-white mb-1.5">
                  Subject
                </label>
                <input
                  {...register("subject")}
                  placeholder="How can we help?"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-borderColor dark:border-gray-700 text-blackColor dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primaryColor/30 focus:border-primaryColor transition text-sm"
                />
                {errors.subject && (
                  <p className="mt-1.5 text-xs text-redColor">{errors.subject.message}</p>
                )}
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-blackColor dark:text-white mb-1.5">
                  Message
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-descriptionColor pointer-events-none" />
                  <textarea
                    {...register("message")}
                    rows={5}
                    placeholder="Tell us more about your question or issue..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-borderColor dark:border-gray-700 text-blackColor dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primaryColor/30 focus:border-primaryColor transition text-sm resize-none"
                  />
                </div>
                {errors.message && (
                  <p className="mt-1.5 text-xs text-redColor">{errors.message.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-sm text-redColor bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full gradient-bg text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? "Sending…" : "Send Message"}
              </button>
            </form>
          )}
        </div>
      </Container>
    </section>
  );
}
