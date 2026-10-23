import { setRules } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getCrewData } from "@/lib/data";

export default async function RulesPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { crew } = await getCrewData(crewId);
  return (
    <section className="view">
      <div className="section">
        <div className="section-head"><h2>House rules</h2></div>
        <div className="panel">
          {crew.rules.trim() ? (
            <div className="rules-text">{crew.rules}</div>
          ) : (
            <div className="empty"><strong>No house rules yet</strong>Write down the group&apos;s rules so nobody argues later.</div>
          )}
        </div>
        <ActionForm action={setRules} fields={{ crew: crew.id }}>
          <div className="field">
            <label className="label" htmlFor="rules">Edit rules</label>
            <textarea
              id="rules" name="rules" rows={7} maxLength={4000} defaultValue={crew.rules} key={crew.rules}
              placeholder={"One anytimer is one 12 oz beer.\nMax one called on the same person per night.\nNo calling one on someone who's driving.\nAnytimers don't cancel each other out."}
            />
          </div>
          <div className="actions"><SubmitButton>Save rules</SubmitButton></div>
        </ActionForm>
      </div>
    </section>
  );
}
