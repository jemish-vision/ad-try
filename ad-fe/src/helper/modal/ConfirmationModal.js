import { t } from 'i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

function ConfirmationModal({ showModal, setShowModal, handler, name, description }) {

    const handleClose = () => setShowModal(false);

    return (
        <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{name}</DialogTitle>
                </DialogHeader>
                <div className="py-3 text-slate-700 dark:text-slate-300 text-sm">
                    <p dangerouslySetInnerHTML={{ __html: description }} className="mb-0" />
                </div>
                <DialogFooter className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" className="px-4" onClick={handleClose}>
                        {t("No")}
                    </Button>
                    <Button className="px-4 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { handler(); setShowModal(false) }}>
                        {t("Yes")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ConfirmationModal;