import { createServerSupabaseClient } from '@/lib/supabase/server';
import { groupByCategory } from '@/lib/dashboard/groupByCategory';
import { RecommendationList } from '@/components/RecommendationList';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <p>Please sign in to view your recommendations.</p>;
  }

  const { data: recommendations } = await supabase
    .from('recommendations')
    .select('id, title, url, category, blurb, learning_action, learning_time_estimate, status')
    .eq('profile_id', user.id)
    .order('score', { ascending: false });

  const { maintain, grow } = groupByCategory(recommendations ?? []);

  return (
    <main>
      <h1>Your Recommendations</h1>
      <section>
        <h2>Grow</h2>
        <RecommendationList recommendations={grow} />
      </section>
      <section>
        <h2>Maintain</h2>
        <RecommendationList recommendations={maintain} />
      </section>
    </main>
  );
}
