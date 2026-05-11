"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { flaskFormRequest, flaskRequest } from "@/lib/flask-api";
import {
  setSessionEmail,
  setSessionRole,
  setSessionToken,
  setSessionUserId,
  setSessionUsername,
} from "@/lib/auth-session";

const SKILLS = [
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Flask",
  "Django",
  "SQL",
  "PostgreSQL",
  "Machine Learning",
  "DevOps",
  "Docker",
  "Cybersecurity",
  "Data Visualization",
];

export default function CreateAccountPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [profilePic, setProfilePic] = useState<File | null>(null);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((current) =>
      current.includes(skill)
        ? current.filter((item) => item !== skill)
        : [...current, skill]
    );
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      type RegisterResponse = { user: { user_id: number; username: string; email: string; role: string } };
      let data: RegisterResponse;
      if (profilePic) {
        const fd = new FormData();
        fd.append("username", username);
        fd.append("email", email);
        fd.append("password", password);
        fd.append("skills", JSON.stringify(selectedSkills));
        fd.append("picture", profilePic);
        data = await flaskFormRequest<RegisterResponse>({ path: "/api/auth/register", body: fd });
      } else {
        data = await flaskRequest<RegisterResponse>({
          path: "/api/auth/register",
          method: "POST",
          body: JSON.stringify({ username, email, password, skills: selectedSkills }),
        });
      }
      setSessionUserId(data.user.user_id);
      setSessionToken(data.user.username);
      setSessionRole(data.user.role);
      setSessionUsername(data.user.username);
      setSessionEmail(data.user.email);
      router.push("/user-profile");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create account.");
    }
  };

  return (
    <div className="flex h-[100dvh] w-[100dvw] flex-col bg-background font-geist text-foreground md:flex-row">
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">Create Account</h1>
          <p className="mt-3 text-muted-foreground">
            Same smooth login style, now with a complete profile and skill set setup.
          </p>
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <input name="username" placeholder="Username" className="w-full rounded-2xl border border-border bg-foreground/5 p-4 text-sm" />
            <input name="email" type="email" placeholder="Email address" className="w-full rounded-2xl border border-border bg-foreground/5 p-4 text-sm" />
            <input name="password" type="password" placeholder="Password" className="w-full rounded-2xl border border-border bg-foreground/5 p-4 text-sm" />
            <div className="rounded-2xl border border-border bg-foreground/5 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Profile picture (optional)</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-2 file:text-xs file:font-medium file:text-violet-100"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setProfilePic(file);
                }}
              />
            </div>
            <div className="rounded-2xl border border-border bg-foreground/5 p-3">
              <p className="mb-2 text-xs text-muted-foreground">Select your skill set</p>
              <div className="grid grid-cols-2 gap-2">
                {SKILLS.map((skill) => (
                  <button
                    type="button"
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-lg border px-2 py-1 text-xs transition ${
                      selectedSkills.includes(skill)
                        ? "border-violet-400 bg-violet-500/20 text-violet-100"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground">
              Create Account
            </button>
            {error ? <p className="text-center text-sm text-rose-400">{error}</p> : null}
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <button type="button" onClick={() => router.push("/sign-in")} className="text-violet-400 hover:underline">
                Sign in
              </button>
            </p>
          </form>
        </div>
      </section>
      <section className="relative hidden flex-1 p-4 md:block">
        <div
          className="absolute inset-4 rounded-3xl bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1518773553398-650c184e0bb3?w=2160&q=80)" }}
        />
      </section>
    </div>
  );
}
