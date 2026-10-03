import {
  Activity, Apple, Baby, Banknote, Bike, BookMarked, BookOpen, Brain, Briefcase, Building2, Bus, CalendarClock, Camera, Car,
  ChartLine, CircleAlert, CircleCheck, CircleDot, Code, Coffee, Dog, Droplets, Dumbbell, Film, Flame, Footprints, Gamepad2, Gift,
  Globe, GlassWater, GraduationCap, Heart, HeartPulse, House, Languages, Laugh, Leaf, Medal, Moon, Music, NotebookPen, Palette,
  PiggyBank, Pill, Plane, Receipt, Repeat, Salad, Shirt, ShoppingCart, Smartphone, Sparkles, Sprout, Stethoscope, Sunrise, Target,
  Trophy, Utensils, Wallet, Wifi, Zap, type LucideProps,
} from "lucide-react";

// Icons the app stores by name (habits, goals, budget categories, bills, notifications).
export const ICONS = {
  activity: Activity, apple: Apple, baby: Baby, banknote: Banknote, bike: Bike, "book-marked": BookMarked, "book-open": BookOpen,
  brain: Brain, briefcase: Briefcase, "building-2": Building2, bus: Bus, "calendar-clock": CalendarClock, camera: Camera, car: Car,
  "chart-line": ChartLine, "circle-alert": CircleAlert, "circle-check": CircleCheck, "circle-dot": CircleDot, code: Code, coffee: Coffee,
  dog: Dog, droplets: Droplets, dumbbell: Dumbbell, film: Film, flame: Flame, footprints: Footprints, "gamepad-2": Gamepad2, gift: Gift,
  globe: Globe, "glass-water": GlassWater, "graduation-cap": GraduationCap, heart: Heart, "heart-pulse": HeartPulse, house: House,
  languages: Languages, laugh: Laugh, leaf: Leaf, medal: Medal, moon: Moon, music: Music, "notebook-pen": NotebookPen, palette: Palette,
  "piggy-bank": PiggyBank, pill: Pill, plane: Plane, receipt: Receipt, repeat: Repeat, salad: Salad, shirt: Shirt,
  "shopping-cart": ShoppingCart, smartphone: Smartphone, sparkles: Sparkles, sprout: Sprout, stethoscope: Stethoscope, sunrise: Sunrise,
  target: Target, trophy: Trophy, utensils: Utensils, wallet: Wallet, wifi: Wifi, zap: Zap,
} as const;

export type IconName = keyof typeof ICONS;

/** Choices offered in the icon pickers. */
export const HABIT_ICONS: IconName[] = ["dumbbell", "book-open", "brain", "glass-water", "salad", "moon", "footprints", "notebook-pen", "coffee", "sunrise", "bike", "pill", "music", "languages", "code", "heart-pulse"];
export const GOAL_ICONS: IconName[] = ["target", "piggy-bank", "footprints", "graduation-cap", "plane", "book-open", "medal", "trophy", "house", "car", "briefcase", "heart-pulse", "sparkles", "gift", "globe", "code"];
export const MONEY_ICONS: IconName[] = ["house", "utensils", "car", "bus", "sparkles", "piggy-bank", "wallet", "shopping-cart", "shirt", "film", "heart-pulse", "graduation-cap", "zap", "wifi", "smartphone", "receipt", "gift", "baby"];

/** A Lucide icon chosen by its name, e.g. <Icon name="dumbbell" />. Unknown names show a dot. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Component = ICONS[name as IconName] ?? CircleDot;
  return <Component aria-hidden {...props} />;
}
