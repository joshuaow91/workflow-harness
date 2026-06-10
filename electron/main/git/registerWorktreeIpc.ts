import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { BranchDeleteResult, Repo, RepoBranchStatus, Worktree } from '@shared/types'
import { addWorktree, discoverRepos, removeWorktree } from './WorktreeService'
import { branchStatus, checkoutBranch, deleteBranches, pullDefault } from './BranchService'

export function registerWorktreeIpc(): void {
  ipcMain.handle(IPC.worktree.listRepos, (): Promise<Repo[]> => discoverRepos())

  ipcMain.handle(
    IPC.worktree.add,
    (_e, repoPath: string, branch: string, fromRef?: string): Promise<Worktree> =>
      addWorktree(repoPath, branch, fromRef)
  )

  ipcMain.handle(
    IPC.worktree.remove,
    (_e, repoPath: string, worktreePath: string, force?: boolean): Promise<void> =>
      removeWorktree(repoPath, worktreePath, force)
  )

  ipcMain.handle(IPC.branch.status, (_e, repoPath: string, fetch?: boolean): Promise<RepoBranchStatus> =>
    branchStatus(repoPath, fetch)
  )
  ipcMain.handle(IPC.branch.pullDefault, (_e, repoPath: string): Promise<void> => pullDefault(repoPath))
  ipcMain.handle(IPC.branch.checkout, (_e, repoPath: string, branch: string): Promise<void> =>
    checkoutBranch(repoPath, branch)
  )
  ipcMain.handle(
    IPC.branch.delete,
    (_e, repoPath: string, names: string[], force?: boolean): Promise<BranchDeleteResult> =>
      deleteBranches(repoPath, names, force)
  )
}
