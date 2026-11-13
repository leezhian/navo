import { Globe } from "lucide-react";
import { bitbucketPath, giteePath, githubPath, gitlabPath } from "./repositoryProviderPaths";

const providerPaths: Record<string, string> = { GitHub: githubPath, GitLab: gitlabPath, Bitbucket: bitbucketPath, Gitee: giteePath };

interface RepositoryProviderIconProps {
  /** 使用本地 Git 远端识别出的服务商；未知主机不冒用品牌标识。 */
  provider: string;
}

export function RepositoryProviderIcon({ provider }: RepositoryProviderIconProps) {
  const iconPath = Object.prototype.hasOwnProperty.call(providerPaths, provider) ? providerPaths[provider] : undefined;
  if (!iconPath) return <Globe aria-hidden="true" className="size-3.5 shrink-0" />;
  return <svg aria-hidden="true" focusable="false" data-provider={provider} className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={iconPath} /></svg>;
}
