"use client";

import { memo, useState } from "react";
import type { Agent } from "@/lib/mock-data";
import StatusBadge from "./StatusBadge";
import { Bot, Clock, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { SygenAPI } from "@/lib/api";
import { useAuthedImage } from "@/lib/hooks";

function AgentCardInner({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const avatarApiUrl = agent.hasAvatar ? SygenAPI.getAgentAvatarUrl(agent.name) : null;
  const avatarUrl = useAuthedImage(avatarApiUrl);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/30 flex items-center justify-center overflow-hidden">
            {avatarUrl && !imgError ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarUrl}
                alt={agent.displayName}
                className="w-10 h-10 rounded-lg object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <Bot size={20} className="text-brand-400" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">{agent.displayName}</h3>
            <p className="text-xs text-text-secondary">{agent.name}</p>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p className="text-sm text-text-secondary mb-4 line-clamp-2">{agent.description}</p>
      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Bot size={12} />
          {agent.model}
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} />
          {agent.sessions} {t('agents.sessions')}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatDate(agent.lastActive)}
        </span>
      </div>
    </div>
  );
}

// Shallow-compare the agent reference. Parent pages mutate the list in place
// on avatar/sandbox saves and don't touch other agents' references, so only
// the actually-changed card re-renders.
const AgentCard = memo(AgentCardInner);
export default AgentCard;
