import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Activity, ScanEye, ArrowUpRight, ChevronRight, LockKeyhole, Radar, MonitorCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  { icon: MonitorCheck, title: "Endpoint visibility", body: "See enrolled Windows devices, their last check-in and reported system health." },
  { icon: ScanEye, title: "Evidence-led detection", body: "Review alerts with the rule, timestamp and endpoint evidence that triggered them." },
  { icon: LockKeyhole, title: "Controlled response", body: "Manage narrowly scoped endpoint firewall policies with explicit approval and acknowledgement." },
];

export const HeroSection = () => {
  const reduceMotion = useReducedMotion();
  const rise = reduceMotion ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.2 } };

  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-20 pt-7 md:px-10">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-72 h-96 w-96 rounded-full bg-cyan-100/60 blur-3xl" />
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/80 bg-white/75 px-5 py-3 shadow-sm backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20"><ShieldCheck className="h-5 w-5" /></span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900">SENTINEL<span className="text-blue-600"> SOC</span><span className="ml-2 align-middle text-[9px] font-bold tracking-[.22em] text-slate-400">EDR CONSOLE</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Endpoint-first security</span>
          <Button asChild size="sm" className="rounded-xl bg-slate-900 px-4 text-white shadow-lg shadow-slate-900/10 hover:bg-blue-700">
            <Link to="/login">Sign in <ArrowUpRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 pb-20 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:pt-28">
        <motion.div {...(reduceMotion ? {} : { initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: .7, ease: [.2,.8,.2,1] } })}>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-blue-700 shadow-sm">
            <Radar className="h-3.5 w-3.5" /> Endpoint security, made visible
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.04] tracking-[-.055em] text-slate-950 md:text-7xl">
            Clarity across<br /><span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">every endpoint.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 md:text-lg">
            A focused security operations workspace for endpoint health, evidence-backed alerts and carefully controlled Windows Firewall policies.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-xl bg-blue-600 px-6 text-white shadow-xl shadow-blue-600/20 transition-all hover:-translate-y-1 hover:bg-blue-700">
              <Link to="/login">Open security console <ChevronRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-slate-200 bg-white/70 px-6 text-slate-700 hover:border-blue-200 hover:bg-blue-50">
              <a href="#capabilities">Explore capabilities</a>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Real endpoint telemetry</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Firebase Spark-first design</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> No synthetic security events</span>
          </div>
        </motion.div>

        <motion.div className="relative mx-auto w-full max-w-xl" {...(reduceMotion ? {} : { initial: { opacity: 0, scale: .94, rotateY: -8 }, animate: { opacity: 1, scale: 1, rotateY: 0 }, transition: { duration: .9, delay: .15 } })}>
          <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-blue-200/60 via-white/20 to-cyan-100/70 blur-2xl" />
          <div className="relative rounded-[2rem] border border-white bg-white/85 p-4 shadow-[0_35px_100px_-35px_rgba(37,83,160,.35)] backdrop-blur-2xl [transform:perspective(1200px)_rotateY(-5deg)_rotateX(3deg)] transition-transform duration-700 hover:[transform:perspective(1200px)_rotateY(0deg)_rotateX(0deg)] md:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Security overview</p><p className="mt-1 text-sm font-bold text-slate-800">Endpoint workspace</p></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">LIVE STATUS WHEN CONNECTED</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-blue-50/80 p-4"><Activity className="h-5 w-5 text-blue-600" /><p className="mt-5 text-2xl font-black text-slate-900">—</p><p className="mt-1 text-[11px] font-medium text-slate-500">Endpoints reporting</p></div>
              <div className="rounded-2xl bg-emerald-50/80 p-4"><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-5 text-2xl font-black text-slate-900">—</p><p className="mt-1 text-[11px] font-medium text-slate-500">Open detections</p></div>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Telemetry stream</p><span className="text-[10px] text-slate-400">Waiting for endpoint data</span></div>
              <div className="mt-5 flex h-24 items-end gap-1.5">{[22,35,27,48,39,62,46,73,54,68,42,58,76,51,66,45,59,37,71,53,63,43,57,78].map((h,i)=><motion.span key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-500/70 to-cyan-400/70" initial={{height:0}} animate={{height:`${h}%`}} transition={{duration:.55,delay:i*.018}} />)}</div>
              <p className="mt-3 text-[10px] text-slate-400">Illustrative interface preview · no live values shown</p>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-950 p-3 text-white shadow-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><LockKeyhole className="h-4 w-4 text-cyan-300" /></span>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold">Policy acknowledgement</p><p className="mt-0.5 text-[10px] text-slate-400">Applied state is reported by the endpoint agent</p></div>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </div>
          </div>
        </motion.div>
      </section>

      <section id="capabilities" className="relative z-10 mx-auto max-w-7xl scroll-mt-10">
        <motion.div {...rise} className="mb-8 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">Built around evidence</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">The essentials for a clearer SOC workflow.</h2><p className="mt-3 text-sm leading-7 text-slate-500">Designed to keep endpoint status, security findings and response actions understandable — without inventing activity that did not happen.</p></motion.div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature, index) => <motion.article key={feature.title} {...rise} transition={{duration:.55,delay:index*.08}} whileHover={reduceMotion ? {} : {y:-7,rotateX:2,rotateY:-2}} className="group rounded-2xl border border-slate-200/80 bg-white/80 p-7 shadow-[0_12px_40px_-28px_rgba(26,55,100,.35)] backdrop-blur-xl transition-shadow hover:shadow-[0_25px_60px_-30px_rgba(37,99,235,.25)]">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110"><feature.icon className="h-6 w-6" /></span>
            <h3 className="mt-6 text-lg font-bold text-slate-900">{feature.title}</h3><p className="mt-2 text-sm leading-7 text-slate-500">{feature.body}</p>
          </motion.article>)}
        </div>
      </section>
      <footer className="relative z-10 mx-auto mt-20 flex max-w-7xl flex-col justify-between gap-3 border-t border-slate-200/80 pt-6 text-xs text-slate-400 sm:flex-row"><span>© {new Date().getFullYear()} Sentinel SOC</span><span>Security visibility with honest, endpoint-reported evidence.</span></footer>
    </main>
  );
};
