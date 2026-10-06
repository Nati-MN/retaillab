import { registerAction } from "@/server/authActions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return <AuthForm mode="register" action={registerAction} />;
}
