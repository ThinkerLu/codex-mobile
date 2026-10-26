import { ref } from 'vue'

export function useNewThreadContext() {
  const cwd = ref('')
  const projectId = ref<string | undefined>()

  // Selecting a folder is a new context, even when two projects share that folder.
  function selectFolder(path: string, selectedProjectId?: string): void {
    cwd.value = path.trim()
    projectId.value = selectedProjectId
  }

  function setWorktreeCwd(path: string): void {
    cwd.value = path.trim()
  }

  return { cwd, projectId, selectFolder, setWorktreeCwd }
}
