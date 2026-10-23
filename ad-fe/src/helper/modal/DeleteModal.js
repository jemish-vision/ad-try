import { t } from 'i18next';
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

function DeleteModal({ showDeleteModal, setShowDeleteModal, deleteHandler, name }) {

    const handleClose = () => setShowDeleteModal(false);

    return (
        <Dialog open={showDeleteModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">{name}</DialogTitle>
                </DialogHeader>
                <div className="py-4 text-center text-slate-700 dark:text-slate-300">
                    <p className="text-base font-medium mb-0">{t("Are you sure want to delete this record?")}</p>
                </div>
                <DialogFooter className="flex justify-center sm:justify-center gap-3 pt-2">
                    <Button variant="outline" className="px-5" onClick={handleClose}>
                        {t("close")}
                    </Button>
                    <Button variant="destructive" className="px-5" onClick={() => { deleteHandler(); setShowDeleteModal(false) }}>
                        {t("Remove")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default DeleteModal;