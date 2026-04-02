"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Plus } from "lucide-react";

interface RepoFormProps {
  onSubmit: (data: { name: string; gitUrl: string; branch: string }) => void;
}

export function RepoForm({ onSubmit }: RepoFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("main");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !gitUrl.trim()) return;
    onSubmit({ name: name.trim(), gitUrl: gitUrl.trim(), branch: branch.trim() });
    setName("");
    setGitUrl("");
    setBranch("main");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Repository
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              placeholder="My Service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">GitLab Clone URL</label>
            <Input
              placeholder="https://gitlab.com/org/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Branch</label>
            <Input
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
