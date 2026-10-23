import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, PlusCircle, Table, TextT, TextAa, Clock, CheckCircle, XCircle
} from '@phosphor-icons/react';

export const cronJobTourConfig = {
    id: "cron-job",
    title: "Cron Jobs Tour",
    steps: [
        { target: "#cronjob-search", icon: MagnifyingGlass, title: "Search Cron Jobs", content: "Easily search for specific cron jobs by name.", blockTargetInteraction: true },
        { target: "#cronjob-add-btn", icon: PlusCircle, title: "Add Cron Job", content: "Click here to define a new automated cron job schedule.", requireClick: true },
        { target: "#cronjob-name-field", icon: TextT, title: "Cron Job Name", content: "Enter a descriptive name for your cron job.", blockTargetInteraction: true },
        { target: "#cronjob-desc-field", icon: TextAa, title: "Cron Description", content: "Provide a detailed description of what this cron job does.", blockTargetInteraction: true },
        { target: "#cronjob-freq-field", icon: Clock, title: "Frequency", content: "Select how often this cron job should run.", blockTargetInteraction: true },
        { target: "#cronjob-submit-btn", icon: CheckCircle, title: "Submit", content: "Click Submit to save and schedule your new cron job.", blockTargetInteraction: true },
        { target: "#cronjob-close-btn", icon: XCircle, title: "Close Modal", content: "Click here to close the modal.", requireClick: true },
        { target: "#cronJob-master-table", icon: Table, title: "Cron Jobs Grid", content: "View all your configured cron jobs. You can edit their schedules, expressions, and active status here.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(cronJobTourConfig);
