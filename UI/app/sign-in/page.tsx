"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInPage, type Testimonial } from "@/components/ui/sign-in";
import { flaskRequest } from "@/lib/flask-api";
import {
  setSessionEmail,
  setSessionRole,
  setSessionToken,
  setSessionUserId,
  setSessionUsername,
} from "@/lib/auth-session";

const sampleTestimonials: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "Amazing platform! The user experience is seamless and the features are exactly what I needed.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "This service has transformed how I work. Clean design, powerful features, and excellent support.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "I've tried many platforms, but this one stands out. Intuitive, reliable, and genuinely helpful.",
  },
];

export default function SignInRoute() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const usernameOrEmail = String(formData.get("usernameOrEmail") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const submitEvent = event.nativeEvent as SubmitEvent;
    const submitter = submitEvent.submitter as HTMLButtonElement | null;
    const adminOnly = submitter?.value === "admin";
    setError(null);

    try {
      const data = await flaskRequest<{
        user: { user_id: number; username: string; email: string; role: string };
      }>({
        path: "/api/auth/login",
        method: "POST",
        body: JSON.stringify({ usernameOrEmail, password, adminOnly }),
      });
      setSessionUserId(data.user.user_id);
      setSessionToken(data.user.username);
      setSessionRole(data.user.role);
      setSessionUsername(data.user.username);
      setSessionEmail(data.user.email);
      router.push(data.user.role === "admin" ? "/admin" : "/user-profile");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to reach Flask backend."
      );
    }
  };

  return (
    <div className="bg-background text-foreground">
      {error && (
        <p className="px-4 pt-4 text-center text-sm text-rose-400">{error}</p>
      )}
      <SignInPage
        heroImageSrc="https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80"
        testimonials={sampleTestimonials}
        onSignIn={(event) => void handleSignIn(event)}
        showAdminOption
        onResetPassword={() => console.log("Reset Password clicked")}
        onCreateAccount={() => router.push("/create-account")}
        
      />
    </div>
  );
}
