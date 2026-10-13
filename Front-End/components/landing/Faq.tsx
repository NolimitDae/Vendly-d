import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { faqs } from "./content";
import SectionHeading from "./SectionHeading";

export default function Faq() {
  return (
    <section aria-labelledby="faq-title" className="bg-blush-50 py-24 sm:py-32 dark:bg-plum-950">
      <div className="mx-auto max-w-[860px] px-5 sm:px-8">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />
        <Accordion data-reveal type="single" collapsible className="mt-14 space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`} className="rounded-3xl border border-plum-900/10 bg-white px-6 sm:px-8 dark:bg-white/5 dark:border-white/10">
              <AccordionTrigger className="cursor-pointer py-6 text-left text-lg font-bold text-plum-900 hover:no-underline dark:text-white">{f.q}</AccordionTrigger>
              <AccordionContent className="pb-6 text-base leading-relaxed text-ink-600 dark:text-white/70">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
