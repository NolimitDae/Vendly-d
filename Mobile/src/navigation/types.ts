import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type EventPlannerStackParams = {
  EPHome: undefined;
  MyEvents: undefined;
  CreateEvent: undefined;
  EventDetail: { eventId: string; eventName: string };
  EPProfile: undefined;
};

export type DiscoverStackParams = {
  Discover: { eventId?: string } | undefined;
};

export type RootTabParams = {
  EventsTab: undefined;
  DiscoverTab: undefined;
  MessagesTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};

export type EPHomeProps = NativeStackScreenProps<EventPlannerStackParams, 'EPHome'>;
export type MyEventsProps = NativeStackScreenProps<EventPlannerStackParams, 'MyEvents'>;
export type CreateEventProps = NativeStackScreenProps<EventPlannerStackParams, 'CreateEvent'>;
export type EventDetailProps = NativeStackScreenProps<EventPlannerStackParams, 'EventDetail'>;
