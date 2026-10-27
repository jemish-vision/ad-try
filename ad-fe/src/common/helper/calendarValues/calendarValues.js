import subDays from "date-fns/subDays";
import startOfWeek from "date-fns/startOfWeek";
import endOfWeek from "date-fns/endOfWeek";
import addDays from "date-fns/addDays";
import startOfMonth from "date-fns/startOfMonth";
import endOfMonth from "date-fns/endOfMonth";
import addMonths from "date-fns/addMonths";

// Rolling reporting windows contain completed days only. Resolve at selection
// time so a tab left open overnight does not keep yesterday's preset dates.
export const getCompletedDaysRange = (days, now = new Date()) => [
  subDays(now, days),
  subDays(now, 1),
];

export const predefinedRanges = [
  {
    label: "Today",
    closeOverlay: false,
    value: [new Date(), new Date()],
    placement: "left",
  },
  {
    label: "Yesterday",
    closeOverlay: false,
    value: [addDays(new Date(), -1), addDays(new Date(), -1)],
    placement: "left",
  },
  {
    label: "Last 7 Days",
    closeOverlay: false,
    value: () => getCompletedDaysRange(7),
    placement: "left",
  },
  {
    label: "Last 14 Days",
    closeOverlay: false,
    value: () => getCompletedDaysRange(14),
    placement: "left",
  },
  {
    label: "This week",
    closeOverlay: false,
    value: [startOfWeek(new Date()), endOfWeek(new Date())],
    placement: "left",
  }, {
    label: "Last week",
    closeOverlay: false,
    value: () => [
      addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), -7),
      addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), -7),
    ],
    placement: "left",
  },
  {
    label: "Next week",
    closeOverlay: false,
    value: () => [
      addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 7),
      addDays(endOfWeek(new Date(), { weekStartsOn: 0 }), 7),
    ],
    placement: "left",
  },
  {
    label: "Last 30 Days",
    closeOverlay: false,
    value: () => getCompletedDaysRange(30),
    placement: "left",
  },
  {
    label: "This month",
    closeOverlay: false,
    value: [startOfMonth(new Date()), new Date()],
    placement: "left",
  },
  {
    label: "Last month",
    closeOverlay: false,
    value: [
      startOfMonth(addMonths(new Date(), -1)),
      endOfMonth(addMonths(new Date(), -1)),
    ],
    placement: "left",
  },
  {
    label: "Last 65 Days",
    closeOverlay: false,
    value: () => getCompletedDaysRange(65),
    placement: "left",
  },
  {
    label: "Last 6 Months",
    closeOverlay: false,
    value: () => getCompletedDaysRange(180),
    placement: "left",
  },
  {
    label: "This year",
    closeOverlay: false,
    value: [new Date(new Date().getFullYear(), 0, 1), new Date()],
    placement: "left",
  },
  {
    label: "Last year",
    closeOverlay: false,
    value: [
      new Date(new Date().getFullYear() - 1, 0, 1),
      new Date(new Date().getFullYear(), 0, 0),
    ],
    placement: "left",
  },
  {
    label: "Reset",
    closeOverlay: false,
    value: [new Date(), new Date()],
    appearance: "default",
  },
];
