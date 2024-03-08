import { ImportProjectForm, addProjectToConsole } from './import-project-form';
import { ProjectInfoForm } from './project-info-form';
import { ProjectSelector } from './project-selector';
import { DownloadSimple, FolderOpen, Info, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useProjectState } from './project-provider';
import { useProject } from '../hooks/useProject';
import { useSelectedCollection } from 'src/hooks/useSelectedCollection.js';
import {
  Modal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@triplit/ui';
import { DeleteProjectDialog } from './delete-project-dialog';

export function ProjectOptionsMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const [_selectedCollection, setSelectedCollection] = useSelectedCollection();
  const [projectPrimaryKey, setSelectedProjectId] = useProjectState();
  const [infoModalIsOpen, setInfoModalIsOpen] = useState(false);
  const [selectModalIsOpen, setSelectModalIsOpen] = useState(false);
  const [importModalIsOpen, setImportModalIsOpen] = useState(false);
  const [deleteProjectDialogIsOpen, setDeleteProjectDialogIsOpen] =
    useState(false);
  const { results: project } = useProject(projectPrimaryKey);
  if (!(project && projectPrimaryKey)) return null;
  return (
    <>
      <DeleteProjectDialog
        projectName={project?.displayName}
        open={deleteProjectDialogIsOpen}
        onOpenChange={setDeleteProjectDialogIsOpen}
      />
      <Modal open={selectModalIsOpen} onOpenChange={setSelectModalIsOpen}>
        <ProjectSelector
          onPressImportProject={() => {
            setSelectModalIsOpen(false);
            setImportModalIsOpen(true);
          }}
        />
      </Modal>
      <Modal
        open={infoModalIsOpen}
        onOpenChange={setInfoModalIsOpen}
        title="Project info"
      >
        <ProjectInfoForm project={project} projectId={projectPrimaryKey} />
      </Modal>
      <Modal
        open={importModalIsOpen}
        onOpenChange={setImportModalIsOpen}
        title="Import a project"
      >
        <ImportProjectForm
          onSubmit={async (values) => {
            try {
              const projectId = await addProjectToConsole(values);
              setSelectedProjectId(projectId);
              setImportModalIsOpen(false);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </Modal>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px]">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setInfoModalIsOpen(true)}>
              <Info size={18} className="w-5 h-5 mr-3" />
              Project info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectModalIsOpen(true)}>
              <FolderOpen size={18} className="w-5 h-5 mr-3" />
              Change project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportModalIsOpen(true)}>
              <DownloadSimple size={18} className="w-5 h-5 mr-3" />
              Import project
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setDeleteProjectDialogIsOpen(true)}
            className={'text-red-500'}
          >
            <Trash size={18} className="w-5 h-5 mr-3" />
            {`Delete ${project?.displayName}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
