import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import { getRateLimiter, LIMITS } from "@/server/rateLimit";

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const rl = await getRateLimiter().check(`login:${email}`, LIMITS.login.limit, LIMITS.login.windowSeconds);
        if (!rl.allowed) return null;
        const user = await db.user.findUnique({ where: { email } });
        // Compare against a dummy hash when the user is unknown to keep timing uniform.
        const hash = user?.passwordHash ?? "$2b$10$CwTycUXWue0Thq9StjUM0uJ8e3qj1p3VJ8nJ8Qy5oQGk8v8H3mF2e";
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
