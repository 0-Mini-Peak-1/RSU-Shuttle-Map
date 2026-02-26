export interface Stop {
    id: string | number;
    name?: string;
    nameTh?: string;
    lat: number;
    lng: number;
    polyIndex?: number;
  }
  
  export interface Vehicle {
    id: string | number;
    assigned_route_id: string;
  }
  
  export interface LocationUpdateData {
    vehicleId?: string | number;
    id?: string | number;
    lat: string | number;
    lng: string | number;
    speed?: string | number;
    velocity?: string | number;
  }