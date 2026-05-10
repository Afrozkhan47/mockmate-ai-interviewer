import { InterviewScroll } from "@/components/InterviewScroll";
import { SignupSection } from "@/components/SignupSection";

export default function Home() {
  return (
    <main className="bg-[#050505] min-h-screen text-white selection:bg-white/20">
      <InterviewScroll />
      <SignupSection />
    </main>
  );
}
