import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Repo, Worktree } from '@shared/types'
import { addWorktree, discoverRepos, removeWorktree } from './WorktreeService'

export function registerWorktreeIpc(): void {
  ipcMain.handle(IPC.worktree.listRepos, (): Promise<Repo[]> => discoverRepos())

  ipcMain.handle(
    IPC.worktree.add,
    (_e, repoPath: string, branch: string, fromRef?: string): Promise<Worktree> =>
      addWorktree(repoPath, branch, fromRef)
  )

  ipcMain.handle(IPC.worktree.remove, (_e, repoPath: string, worktreePath: string): Promise<void> =>
    removeWorktree(repoPath, worktreePath)
  )
}
