import { loginAction } from "@/server/authActions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthForm mode="login" action={loginAction} />;
}
