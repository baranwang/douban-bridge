import { Octokit } from "@octokit/core";
import { OAuthApp } from "@octokit/oauth-app";

const GITHUB_REPO_OWNER = "baranwang";
const GITHUB_REPO_NAME = "stremio-addon-douban";

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

export class GitHubAPI {
  private oauthApp: OAuthApp;

  constructor(
    private clientId: string,
    clientSecret: string,
  ) {
    this.oauthApp = new OAuthApp({
      clientId,
      clientSecret,
    });
  }

  /**
   * 生成 GitHub OAuth 授权 URL
   */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      state,
      scope: "", // 不需要任何特殊权限
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * 使用授权码交换 access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    const { authentication } = await this.oauthApp.createToken({ code });
    return authentication.token;
  }

  /**
   * 获取当前用户信息
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.request("GET /user");
    return {
      id: data.id,
      login: data.login,
      avatar_url: data.avatar_url,
    };
  }

  /**
   * 检查用户是否 star 了指定仓库
   */
  async checkStarStatus(accessToken: string): Promise<boolean> {
    const octokit = new Octokit({ auth: accessToken });
    try {
      await octokit.request("GET /user/starred/{owner}/{repo}", {
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
      });
      return true;
    } catch {
      // 404 表示未 star
      return false;
    }
  }
}
