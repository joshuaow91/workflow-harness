import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { SessionRef } from '@shared/types'
import type { GhIssueEdit } from '@shared/types'
import {
  addIssueComment,
  editIssue,
  enrichLinks,
  fetchAsset,
  issueDetail,
  listIssues,
  listMyPRs,
  listMyPRsAll,
  listProjects,
  listReviewPRs,
  projectItems,
  setProjectItemField,
  repoAssignees,
  repoLabels,
  repoMilestones,
  setIssueState
} from './GitHubService'

export function registerGithubIpc(): void {
  ipcMain.handle(IPC.github.issues, (_e, repo: string, state?: string, search?: string, limit?: number) =>
    listIssues(repo, state, search, limit)
  )
  ipcMain.handle(IPC.github.issueDetail, (_e, repo: string, number: number) =>
    issueDetail(repo, number)
  )
  ipcMain.handle(IPC.github.addComment, (_e, repo: string, number: number, body: string) =>
    addIssueComment(repo, number, body)
  )
  ipcMain.handle(
    IPC.github.setIssueState,
    (_e, repo: string, number: number, action: 'close' | 'reopen') =>
      setIssueState(repo, number, action)
  )
  ipcMain.handle(IPC.github.fetchAsset, (_e, url: string) => fetchAsset(url))
  ipcMain.handle(IPC.github.repoLabels, (_e, repo: string) => repoLabels(repo))
  ipcMain.handle(IPC.github.repoAssignees, (_e, repo: string) => repoAssignees(repo))
  ipcMain.handle(IPC.github.repoMilestones, (_e, repo: string) => repoMilestones(repo))
  ipcMain.handle(IPC.github.editIssue, (_e, repo: string, number: number, patch: GhIssueEdit) =>
    editIssue(repo, number, patch)
  )
  ipcMain.handle(IPC.github.myPRs, (_e, repo: string) => listMyPRs(repo))
  ipcMain.handle(IPC.github.myPRsAll, () => listMyPRsAll())
  ipcMain.handle(IPC.github.reviewPRs, () => listReviewPRs())
  ipcMain.handle(IPC.github.listProjects, (_e, owner: string) => listProjects(owner))
  ipcMain.handle(IPC.github.projectItems, (_e, owner: string, number: number) =>
    projectItems(owner, number)
  )
  ipcMain.handle(
    IPC.github.setProjectField,
    (_e, projectId: string, itemId: string, fieldId: string, optionId: string) =>
      setProjectItemField(projectId, itemId, fieldId, optionId)
  )
  ipcMain.handle(IPC.github.enrichLinks, (_e, refs: SessionRef[]) => enrichLinks(refs))
}
