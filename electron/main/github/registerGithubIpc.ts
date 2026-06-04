import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  listIssues,
  listMyPRs,
  listProjects,
  listReviewPRs,
  projectItems
} from './GitHubService'

export function registerGithubIpc(): void {
  ipcMain.handle(IPC.github.issues, (_e, repo: string) => listIssues(repo))
  ipcMain.handle(IPC.github.myPRs, (_e, repo: string) => listMyPRs(repo))
  ipcMain.handle(IPC.github.reviewPRs, () => listReviewPRs())
  ipcMain.handle(IPC.github.listProjects, (_e, owner: string) => listProjects(owner))
  ipcMain.handle(IPC.github.projectItems, (_e, owner: string, number: number) =>
    projectItems(owner, number)
  )
}
