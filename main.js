function getNextPage(linksHeader) {
  // from github.js Requestable.js
  var links = linksHeader.split(/\s*,\s*/); // splits and strips the urls
  
  return links.reduce(function(nextUrl, link) {
    if (link.search(/rel\s*=\s*"next"/) !== -1) {
      return (link.match(/<(.*)>/) || [])[1];
    }
    return nextUrl;
  }, undefined);
}


var PullRequest = React.createClass({
  displayName: 'PullRequest',
  render: function() {
    var updated = moment(this.props.data.updated_at).fromNow();
    var created = moment(this.props.data.created_at).fromNow();
    var milestone = (this.props.data.milestone && this.props.data.milestone.title);
    return (
      <div className="row">
        <div className="pull-request col-xs-12">
          <a href={this.props.data.html_url} className="pr-link col-xs-12">
            <div className="row">
              <div className='pr-title-row col-xs-12'>
                <span className='pr-repo-name'>
                  {this.props.data.base.repo.full_name}
                </span>
                <span className='pr-title'>
                  {this.props.data.title}
                </span>
              </div>
            </div>
            <div className="row">
              <div className='pr-subtitle col-xs-12'>
                #{this.props.data.number}
                { " " }
                opened {created}
                { " " }
                by @{this.props.data.user.login}
                { " " }
                {milestone}
                <br/>
                Updated {updated}
              </div>
            </div>
          </a>
        </div>
      </div>
    )
  },
});


var PullRequestList = React.createClass({
  displayName: 'PullRequestList',
  getInitialState: function() {
    return {
      pulls: [],
      loadedRepos: {},
    };
  },
  componentDidMount: function() {
    this.fetchNewPulls(this.props.repos);
  },
  componentWillReceiveProps: function (props) {
    // on updated props, update PRs
    this.fetchNewPulls(props.repos);
  },
  render: function() {
    var that = this;
    var prNodes = this.state.pulls.map(function (pr_data) {
      return (
        <PullRequest key={pr_data.id} data={pr_data} github={github} />
      )
    });
    // sort by updated:
    prNodes.sort(function (prA, prB) {
      var a = prA.props.data.updated_at;
      var b = prB.props.data.updated_at;
      if (a > b) return -1;
      if (b > a) return 1;
      return 0;
    });
    return (
      <div className="prList">
        {prNodes}
      </div>
    )
  },
  fetchNewPulls: function (repos) {
    // fetch PRs for repos we haven't seen before
    var that = this;
    repos.map(function (repo) {
      if (!that.state.loadedRepos[repo.full_name]) {
        that.loadPulls(repo);
      }
    })
  },
  loadPulls: function(repo) {
    // load pull-requests for a single repo
    var that = this;
    this.state.loadedRepos[repo.full_name] = true;
    this.props.github.getRepo(repo.full_name).listPullRequests().then(function(resp) {
      that.setState({
        pulls: that.state.pulls.concat(resp.data),
      })
    })
  },
});


var User = React.createClass({
  displayName: 'User',
  getInitialState: function() {
    return {
      repos: [],
      profile: {},
    };
  },
  componentDidMount: function() {
    window.props = this.props;
    this.loadProfile();
    this.loadRepos();
  },
  render: function() {
    return (
      <div className="user">
        <h2 className="text-center">
          Showing all GitHub pull requests mergeable by
          <span className="username">
          {" "} @{this.state.profile.login}
          </span>
        </h2>
        <PullRequestList repos={this.state.repos} github={github} />
      </div>
    )
  },
  loadProfile: function () {
    var that = this;
    this.props.user.getProfile().then(function (profile) {
      that.setState({
        profile: profile.data
      });
    });
  },
  loadRepos: function() {
    var that = this;
    // use paged request to load data piecemeal
    // this is based on github.js _requestAllPages
    var user = this.props.user;
    function handleMoreRepos(resp) {
      if (resp.headers.link !== undefined) {
        var nextUrl = getNextPage(resp.headers.link);
        if (nextUrl) {
          user._request('GET', nextUrl).then(handleMoreRepos);
        }
      }
      // filter out repos we can't push to and don't have open issues
      var new_repos = resp.data.filter(function (repo) {
        if (!repo.permissions.push) return false;
        if (repo.open_issues_count === 0) return false;
        return true;
      })
      that.setState({
        repos: that.state.repos.concat(new_repos),
      });
    }
    user._request('GET', '/user/repos', {sort: 'updated'}).then(handleMoreRepos);
  },
});


var RateLimit = React.createClass({
  displayName: 'RateLimit',
  render: function() {
    var reset_date = (new Date(this.props.data.rate.reset * 1000)).toLocaleString();
    return (
      <div className="row">
        <h2 className="rate-limit-error col-xs-12">
        GitHub API Rate limit exceeded! Try again after {reset_date}.
        </h2>
      </div>
    )
  },
});


var code_match = window.location.href.match(/\?code=(.*)/);
if (!code_match) {
  window.location = "https://github.com/login/oauth/authorize?scope=read:org&client_id=19277e98ad9400d0133b&redirect_uri=" + window.location;
} else {
  var code = code_match[1];
  // scrub OAuth code from URL
  window.history.replaceState("not sure", "All My Pulls", window.location.pathname);
  
  // request OAuth token
  $.getJSON('https://minrk-github-oauth.herokuapp.com/authenticate/' + code, function(data) {
    // create GitHub client
    var github = window.github = new GitHub({
      token: data.token
    });
    
    // check rateLimit, then proceed
    github.getRateLimit().getRateLimit().then(function(resp) {
      console.log('API limit remaining: ' + resp.data.rate.remaining);
      // date constructor takes epoch milliseconds and we get epoch seconds
      if (resp.data.rate.remaining === 0) {
        // don't burn the rate limit
        ReactDOM.render(
          <RateLimit data={resp.data} />,
          document.getElementById('content')
        );
        return;
      }

      var user = github.getUser();
      ReactDOM.render(
        <User github={github} user={user} data={data}/>,
        document.getElementById('content')
      );
    }).catch(function(error) {
        console.log('Error fetching rate limit', error.message);
    });
  });
}