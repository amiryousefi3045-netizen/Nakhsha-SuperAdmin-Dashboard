declare module "./pages/Home" {
  const Home: React.FC;
  export default Home;
}

declare module "./pages/CreateCraft" {
  const CreateCraft: React.FC;
  export default CreateCraft;
}

declare module "./pages/EditCraft" {
  const EditCraft: React.FC;
  export default EditCraft;
}

declare module "./pages/Login" {
  const Login: React.FC;
  export default Login;
}

declare module "./pages/PublicProfile" {
  const PublicProfile: React.FC;
  export default PublicProfile;
}

declare module "./pages/HomeNew" {
  const HomeNew: React.FC;
  export default HomeNew;
}

declare module "./pages/RecipeDetail" {
  const RecipeDetail: React.FC;
  export default RecipeDetail;
}

declare module "./components/Navbar" {
  const Navbar: React.FC;
  export default Navbar;
}

declare module "./components/CraftList" {
  interface CraftListProps {
    items: any[];
    loading?: boolean;
  }
  const CraftList: React.FC<CraftListProps>;
  export default CraftList;
}

declare module "./components/Map" {
  interface MapProps {
    items?: any[];
    bounds?: any;
    onBoundsChange?: (bounds: any) => void;
    [key: string]: any;
  }
  const Map: React.FC<MapProps>;
  export default Map;
}

declare module "./components/MobileBottomSheet" {
  interface MobileBottomSheetProps {
    children: React.ReactNode;
    [key: string]: any;
  }
  const MobileBottomSheet: React.FC<MobileBottomSheetProps>;
  export default MobileBottomSheet;
}

declare module "./components/FilterSidebar" {
  interface FilterSidebarProps {
    [key: string]: any;
  }
  const FilterSidebar: React.FC<FilterSidebarProps>;
  export default FilterSidebar;
}

declare module "./components/FilterToolbar" {
  interface FilterToolbarProps {
    [key: string]: any;
  }
  const FilterToolbar: React.FC<FilterToolbarProps>;
  export default FilterToolbar;
}

declare module "./components/FilterChips" {
  interface FilterChipsProps {
    [key: string]: any;
  }
  const FilterChips: React.FC<FilterChipsProps>;
  export default FilterChips;
}

declare module "./components/EnhancedFilters" {
  const EnhancedFilters: React.FC<any>;
  export default EnhancedFilters;
}

declare module "./components/ProfileBanner" {
  const ProfileBanner: React.FC<any>;
  export default ProfileBanner;
}

declare module "./components/ProfileHeader" {
  const ProfileHeader: React.FC<any>;
  export default ProfileHeader;
}

declare module "./components/ProfileTabs" {
  const ProfileTabs: React.FC<any>;
  export default ProfileTabs;
}

declare module "./components/ProfileTabContent" {
  const ProfileTabContent: React.FC<any>;
  export default ProfileTabContent;
}

declare module "./components/RecipeList" {
  const RecipeList: React.FC<any>;
  export default RecipeList;
}
