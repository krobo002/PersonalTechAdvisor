'use client';

import { useState } from 'react';

interface Recommendation {
  id: string;
  title: string;
  url: string;
  category: 'maintain' | 'grow';
  blurb: string;
  learning_action: string;
  learning_time_estimate: string;
  status: string;
}

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(recommendations.map((rec) => [rec.id, rec.status]))
  );

  async function updateStatus(id: string, status: string) {
    const response = await fetch(`/api/recommendations/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      setStatuses((prev) => ({ ...prev, [id]: status }));
    }
  }

  if (recommendations.length === 0) {
    return <p>Nothing here yet.</p>;
  }

  return (
    <ul>
      {recommendations.map((rec) => (
        <li key={rec.id}>
          <strong>
            <a href={rec.url}>{rec.title}</a>
          </strong>
          <p>{rec.blurb}</p>
          <p>
            {rec.learning_action} ({rec.learning_time_estimate})
          </p>
          <select value={statuses[rec.id]} onChange={(event) => updateStatus(rec.id, event.target.value)}>
            <option value="new">New</option>
            <option value="in-progress">In progress</option>
            <option value="learned">Learned</option>
            <option value="skipped">Skipped</option>
          </select>
        </li>
      ))}
    </ul>
  );
}
